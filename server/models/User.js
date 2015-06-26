var Bookshelf = require('../configs/db').bookshelf;
var Todos = require('./Todos');
var Encrypt = require('./Encrypt');
var Promise = require('bluebird');
var Checkit = require('checkit');

Promise.promisifyAll(Encrypt);

// TODO: abstract
var registrationValidate = new Checkit({
    first_name: 'required',
    last_name: 'required',
    email: ['required', 'email'],
    password: ['required', 'minLength:8'],
    code: 'required'
});

var User = Bookshelf.Model.extend({
    tableName: 'users',
    hasTimestamps: true,

    todos: function () {
        return this.hasMany(Todos);
    },
    initialize: function() {
        this.on('saving', this.validateSave);
    },
    validateSave: function() {
        return registrationValidate.run(this.attributes);
    },
    // TODO: abstract to be reusable by other models
    orderBy: function (column, order) {
        return this.query(function (qb) {
            qb.orderBy(column, order);
        });
    }
}, {
    // Validate and login user
    login: Promise.method( function (email, password) {
        if (!email || !password) throw new Error('Email and password are both required');
        return new this({email: email.toLowerCase().trim()}).fetch({require: true}).tap( function (user) {
            if (!user) throw new Error('A connection error occurred. Please try again. ');
            if (!user.get('verified')) throw new Error('User not verified.');

            // validate password matches
            return Encrypt.comparePasswordAsync(password, user.get('password')).then( function (matched, err) {
                if (err) throw new Error('Connection error. Please try again. ');
                if (!matched) throw new Error('Username or Password are invalid. Please try again. ');

                return matched;
            });
        });
    }),
    // Register new user
    register: Promise.method( function (data) {
        if (!data) throw new Error('Fill in required fields');

        return registrationValidate.run(data).then( function(validated, err) {
            if (err) throw new Error('A validation error occurred. Please register again.');

            return validated;

        }).then( function(validated) {
            console.log(validated.password);
            return Encrypt.hashPasswordAsync(validated.password).then( function (hash, err) {
                if (err) throw new Error('A connection error occurred. Please register again.');

                delete validated.password;
                return [validated, hash];
            })
        }).then( function(insertable) {
            var valid = insertable[0];
            var hashed = insertable[1];

            return User.forge({
                first_name: valid.first_name,
                last_name: valid.last_name,
                email: valid.email.toLowerCase().trim(),
                password: hashed,
                code: valid.code
            }).save()
                .tap( function(user) {
                    if (!user) throw new Error('A connection error occurred. Please register again. ');

            });
        }).catch(Checkit.Error, function(err) {
            console.log(err.toJSON());
        })
    })
});

var Users = Bookshelf.Collection.extend({
    model: User,
    // TODO: abstract
    orderBy: function (column, order) {
        return this.query(function (qb) {
            qb.orderBy(column, order);
        });
    }
});

module.exports = {
    User: User,
    Users: Users
};